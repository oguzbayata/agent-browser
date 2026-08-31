'use strict';

const CATEGORY_LABELS = Object.freeze({
  core: 'Session tools',
  opsec: 'Advanced privacy and identity',
  osint: 'OSINT and open-source intelligence',
  scrape: 'Autonomous data scraping',
  ai: 'AI and API integrations',
  devtools: 'Developer tools',
});

const CATEGORY_ICONS = Object.freeze({
  core: '<path d="M10 2.6 16.2 5.2v4.4c0 4.1-2.5 6.9-6.2 8.1C6.3 16.5 3.8 13.7 3.8 9.6V5.2Z" />',
  opsec: '<path d="M10 2.6 16.2 5.2v4.4c0 4.1-2.5 6.9-6.2 8.1C6.3 16.5 3.8 13.7 3.8 9.6V5.2Z" />',
  osint: '<circle cx="8.6" cy="8.6" r="4.4"/><path d="M11.8 11.8 16.2 16.2"/>',
  scrape: '<rect x="3.4" y="4.4" width="13.2" height="11.2" rx="1.2"/><path d="M3.4 8.2h13.2M8.2 4.4v11.2"/>',
  ai: '<rect x="3.4" y="4.2" width="13.2" height="11.6" rx="2"/><path d="M7.2 8.2h5.6M7.2 11.2h3.8"/>',
  devtools: '<path d="M7.2 6.4 3.8 10l3.4 3.6M12.8 6.4 16.2 10l-3.4 3.6M11.2 5.2 8.8 14.8"/>',
});

const removed = new Set();
const localActive = new Map();
const expandedDetails = new Set();

const OPEN_ACTIONS = new Set(['shield', 'ghost', 'downloads', 'models', 'memory-bridge']);

const WIRED_EXTENSION_IDS = new Set([
  'shield',
  'ghost',
  'guvenlik',
  'hunter',
  'cookies',
  'dnt',
  'ua',
  'models',
  'canvas-poisoner',
  'canvas-fingerprint-defender',
  'siyuan-bridge',
  'human-jitter',
  'human-jitter-cursor-simulator',
  'dead-man-switch',
  'web3-shield',
  'shadow-dom-pierce',
  'shadow-dom-piercer',
  'markdown-dom',
  'page-to-markdown-converter',
  'ui-code-extract',
  'infinite-scroll',
  'infinite-scroll-autopilot',
  'table-parser',
  'table-to-json-auto-parser',
  'xhr-hunter',
  'xhr-fetch-payload-catcher',
  'json-form-fill',
  'proxy-rotate',
  'dynamic-proxy-swapper',
  'webgl-inspector',
  'media-source',
  'media-source-blob-revealer',
  'n8n-webhook',
  'multi-agent-swarm-broadcaster',
  'lm-studio-port',
  'memory-block',
  'cursor-ide-bridge',
  'tab-orchestrator',
  'autonomous-agent-task-queue',
  'headless-mode',
  'headless-mode-resource-saver',
  'input-simulator',
  'rate-limit-guard',
  'rate-limit-auto-pauser',
  'sandbox-isolator',
  'excommunicado-lock',
  'user-agent-rotator',
  'third-party-cookie-annihilator',
]);

function isWiredExtension(item) {
  return Boolean(item.noToggle || item.setting || WIRED_EXTENSION_IDS.has(item.id));
}

function extensionStatus(item) {
  if (item.noToggle) {
    return {
      kind: 'live',
      text: 'Always available in this session. Use Open if you want the local model chat.',
    };
  }
  if (isWiredExtension(item)) {
    return isActive(item)
      ? { kind: 'live', text: 'On for this RAM session. The browser applies this tool now.' }
      : { kind: 'idle', text: 'Off. Turn the switch on to use it in this session.' };
  }
  return isActive(item)
    ? { kind: 'catalog', text: 'Marked on, but this catalog tool has no engine hook yet.' }
    : { kind: 'catalog', text: 'Catalog entry. The switch only stores session intent until a hook is added.' };
}

function catalog() {
  return Array.isArray(typeof agentExtensions !== 'undefined' ? agentExtensions : null) ? agentExtensions : [];
}

function isActive(item) {
  if (localActive.has(item.id)) {
    return localActive.get(item.id);
  }
  const states = window.__extensionStates;
  if (states && typeof states === 'object' && Object.prototype.hasOwnProperty.call(states, item.id)) {
    return Boolean(states[item.id]);
  }
  const privacy = window.__privacySettings;
  if (item.setting && privacy && typeof privacy === 'object' && typeof privacy[item.setting] === 'boolean') {
    return privacy[item.setting];
  }
  return Boolean(item.active);
}

function visibleCatalog(query) {
  const needle = String(query || '').trim().toLowerCase();
  return catalog().filter((item) => {
    if (removed.has(item.id)) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const hay = `${item.name} ${item.id} ${item.description} ${CATEGORY_LABELS[item.category] || item.category}`.toLowerCase();
    return hay.includes(needle);
  });
}

function updateCounts(visible) {
  const total = catalog().filter((item) => !removed.has(item.id)).length;
  const heading = document.getElementById('ext-heading');
  if (heading) {
    heading.textContent = visible === total ? `All extensions (${total})` : `All extensions (${visible} / ${total})`;
  }
  const navCount = document.getElementById('ext-nav-count');
  if (navCount) {
    navCount.textContent = String(total);
  }
}

function renderExtensions(data) {
  const grid = document.getElementById('extensions-grid');
  const empty = document.getElementById('ext-empty');
  const query = document.getElementById('ext-query')?.value || '';
  if (!grid) {
    return;
  }

  const items = Array.isArray(data) ? data : visibleCatalog(query);
  if (empty) {
    empty.hidden = items.length > 0;
  }
  updateCounts(items.length);
  grid.replaceChildren();
  let lastCategory = null;

  for (const item of items) {
    if (item.category && item.category !== lastCategory) {
      lastCategory = item.category;
      const group = document.createElement('h3');
      group.className = 'ext-group';
      group.textContent = CATEGORY_LABELS[item.category] || item.category;
      grid.append(group);
    }

    const card = document.createElement('article');
    card.className = item.alert ? 'ext-card is-alert' : 'ext-card';
    card.dataset.id = item.id;

    const icon = document.createElement('div');
    icon.className = 'ext-icon is-color';
    icon.innerHTML = typeof window.extensionIconSvg === 'function'
      ? window.extensionIconSvg(item.id, catalog().findIndex((entry) => entry.id === item.id))
      : `<svg viewBox="0 0 20 20" aria-hidden="true">${CATEGORY_ICONS[item.category] || CATEGORY_ICONS.opsec}</svg>`;

    const copy = document.createElement('div');
    copy.className = 'ext-copy';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const desc = document.createElement('p');
    desc.className = 'ext-preview';
    desc.textContent = item.description;
    const idLine = document.createElement('p');
    idLine.className = 'ext-id';
    idLine.textContent = `session/${item.id}`;
    copy.append(title, desc, idLine);

    const actions = document.createElement('div');
    actions.className = 'ext-actions';

    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'ext-btn';
    details.dataset.details = item.id;
    details.setAttribute('aria-expanded', expandedDetails.has(item.id) ? 'true' : 'false');
    details.textContent = 'Details';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ext-btn is-danger';
    remove.dataset.remove = item.id;
    remove.textContent = 'Remove';

    actions.append(details, remove);
    if (!item.noToggle) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ext-switch';
      toggle.dataset.ext = item.id;
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', isActive(item) ? 'true' : 'false');
      toggle.setAttribute('aria-label', `${item.name} on/off`);
      actions.append(toggle);
    }

    const panel = document.createElement('div');
    panel.className = 'ext-detail';
    panel.hidden = !expandedDetails.has(item.id);
    const label = document.createElement('p');
    label.className = 'ext-detail-label';
    label.textContent = 'What it does';
    const body = document.createElement('p');
    body.className = 'ext-detail-body';
    body.textContent = item.description || 'No description for this session tool.';
    const status = document.createElement('p');
    const statusInfo = extensionStatus(item);
    status.className = `ext-detail-status is-${statusInfo.kind}`;
    status.textContent = statusInfo.text;
    panel.append(label, body, status);
    if (item.action && OPEN_ACTIONS.has(item.action)) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'ext-btn ext-detail-open';
      open.dataset.action = item.action;
      open.textContent = 'Open';
      panel.append(open);
    }
    if (expandedDetails.has(item.id)) {
      card.dataset.open = 'true';
    }
    card.append(icon, copy, actions, panel);
    grid.append(card);
  }
}

function applyExtensionStates(settings) {
  if (settings && typeof settings === 'object') {
    window.__privacySettings = settings;
    if (settings.extensionStates && typeof settings.extensionStates === 'object') {
      window.__extensionStates = settings.extensionStates;
    }
    localActive.clear();
  }
  renderExtensions();
}

function bindExtensionGrid() {
  const grid = document.getElementById('extensions-grid');
  const api = window.electronAPI;

  document.getElementById('ext-query')?.addEventListener('input', () => {
    renderExtensions();
  });

  grid?.addEventListener('click', (event) => {
    const detailsBtn = event.target.closest('[data-details]');
    if (detailsBtn) {
      const id = detailsBtn.dataset.details;
      const card = detailsBtn.closest('.ext-card');
      const panel = card?.querySelector('.ext-detail');
      const open = !expandedDetails.has(id);
      if (open) {
        expandedDetails.add(id);
      } else {
        expandedDetails.delete(id);
      }
      detailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (card) {
        if (open) {
          card.dataset.open = 'true';
        } else {
          delete card.dataset.open;
        }
      }
      if (panel) {
        panel.hidden = !open;
      }
      return;
    }

    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn) {
      api?.toolsAction?.(actionBtn.dataset.action);
      return;
    }

    const removeBtn = event.target.closest('[data-remove]');
    if (removeBtn) {
      removed.add(removeBtn.dataset.remove);
      localActive.delete(removeBtn.dataset.remove);
      expandedDetails.delete(removeBtn.dataset.remove);
      api?.toggleExtension?.(removeBtn.dataset.remove, false);
      renderExtensions();
      return;
    }

    const toggle = event.target.closest('[data-ext]');
    if (!toggle || toggle.dataset.remove) {
      return;
    }
    const id = toggle.dataset.ext;
    const next = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', next ? 'true' : 'false');
    localActive.set(id, next);
    api?.updateAgentExtension?.(id, next);
    api?.toggleExtension?.(id, next)?.then((result) => {
      if (result?.settings) {
        applyExtensionStates(result.settings);
      }
    });
  });

  api?.onSettings?.((settings) => {
    applyExtensionStates(settings);
  });
  api?.getSettings?.()?.then((result) => {
    if (result?.settings) {
      applyExtensionStates(result.settings);
    } else {
      renderExtensions();
    }
  });

  renderExtensions();
}

window.renderExtensions = renderExtensions;
bindExtensionGrid();
