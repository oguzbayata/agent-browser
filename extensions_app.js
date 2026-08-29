'use strict';

const CATEGORY_LABELS = Object.freeze({
  opsec: 'Advanced privacy and identity',
  osint: 'OSINT and open-source intelligence',
  scrape: 'Autonomous data scraping',
  ai: 'AI and API integrations',
  devtools: 'Developer tools',
});

const CATEGORY_ICONS = Object.freeze({
  opsec: '<path d="M10 2.6 16.2 5.2v4.4c0 4.1-2.5 6.9-6.2 8.1C6.3 16.5 3.8 13.7 3.8 9.6V5.2Z" />',
  osint: '<circle cx="8.6" cy="8.6" r="4.4"/><path d="M11.8 11.8 16.2 16.2"/>',
  scrape: '<rect x="3.4" y="4.4" width="13.2" height="11.2" rx="1.2"/><path d="M3.4 8.2h13.2M8.2 4.4v11.2"/>',
  ai: '<rect x="3.4" y="4.2" width="13.2" height="11.6" rx="2"/><path d="M7.2 8.2h5.6M7.2 11.2h3.8"/>',
  devtools: '<path d="M7.2 6.4 3.8 10l3.4 3.6M12.8 6.4 16.2 10l-3.4 3.6M11.2 5.2 8.8 14.8"/>',
});

const removed = new Set();
const localActive = new Map();

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
    card.className = 'ext-card';
    card.dataset.id = item.id;

    const icon = document.createElement('div');
    icon.className = 'ext-icon';
    icon.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${CATEGORY_ICONS[item.category] || CATEGORY_ICONS.opsec}</svg>`;

    const copy = document.createElement('div');
    copy.className = 'ext-copy';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const desc = document.createElement('p');
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
    details.textContent = 'Details';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ext-btn is-danger';
    remove.dataset.remove = item.id;
    remove.textContent = 'Remove';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ext-switch';
    toggle.dataset.ext = item.id;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', isActive(item) ? 'true' : 'false');
    toggle.setAttribute('aria-label', `${item.name} on/off`);

    actions.append(details, remove, toggle);
    card.append(icon, copy, actions);
    grid.append(card);
  }
}

function applyExtensionStates(settings) {
  if (settings && typeof settings.extensionStates === 'object' && settings.extensionStates) {
    window.__extensionStates = settings.extensionStates;
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
    const removeBtn = event.target.closest('[data-remove]');
    if (removeBtn) {
      removed.add(removeBtn.dataset.remove);
      localActive.delete(removeBtn.dataset.remove);
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
