'use strict';

const api = window.electronAPI;

const TOOLS = Object.freeze([
  {
    id: 'shield',
    setting: 'blockTrackers',
    name: 'Kalkan',
    description: 'Reklam ve izleyici isteklerini keser. Yalnızca bu RAM oturumunda durur.',
    action: 'shield',
    icon: 'shield',
  },
  {
    id: 'ghost',
    setting: 'ghostNetwork',
    name: 'Hayalet Ağ',
    description: 'Trafiği SOCKS5 vekile alır; kamera, konum ve ekran paylaşımı kesilir.',
    action: 'ghost',
    icon: 'ghost',
  },
  {
    id: 'guvenlik',
    setting: 'blockMedia',
    name: 'Güvenlik V1',
    description: 'Bilgisayarın mikrofonu ve kamerasını (video, fotoğraf ve diğer medya) otomatik olarak kapatır.',
    action: 'settings',
    icon: 'guvenlik',
  },
  {
    id: 'hunter',
    setting: 'mediaHunter',
    name: 'Medya Avcısı',
    description: 'Sayfadaki video ve görselleri oturum indirme listesine alır.',
    action: 'downloads',
    icon: 'hunter',
  },
  {
    id: 'cookies',
    setting: 'stripThirdPartyCookies',
    name: 'Çerez kesici',
    description: 'Üçüncü taraf çerezlerini düşürür; oturum diske yazılmaz.',
    action: 'settings',
    icon: 'cookies',
  },
  {
    id: 'dnt',
    setting: 'sendDnt',
    name: 'Do Not Track',
    description: 'Giden isteklere DNT başlığı ekler.',
    action: 'settings',
    icon: 'dnt',
  },
  {
    id: 'ua',
    setting: 'spoofUserAgent',
    name: 'Kimlik maskesi',
    description: 'Ortak bir Chrome kullanıcı ajanı göndererek parmak izini azaltır.',
    action: 'settings',
    icon: 'ua',
  },
  {
    id: 'models',
    setting: null,
    name: 'Yerel modeller',
    description: 'Oturuma bağlı dil modeli ve ajan. Kalıcı uzantı değildir.',
    action: 'models',
    icon: 'models',
  },
]);

const ICONS = {
  shield: '<path d="M10 2.6 16.2 5.2v4.4c0 4.1-2.5 6.9-6.2 8.1C6.3 16.5 3.8 13.7 3.8 9.6V5.2Z" />',
  ghost:
    '<path d="M10 3.2c-2.8 0-5 2-5 4.8v6.2l1.6-1.1 1.6 1.1 1.8-1.1 1.8 1.1 1.6-1.1 1.6 1.1V8c0-2.8-2.2-4.8-5-4.8z"/><circle cx="8" cy="8.4" r="0.8" fill="currentColor" stroke="none"/><circle cx="12" cy="8.4" r="0.8" fill="currentColor" stroke="none"/>',
  hunter: '<circle cx="10" cy="10" r="3.2"/><path d="M10 3.2v2.2M10 14.6v2.2M3.2 10h2.2M14.6 10h2.2M5.2 5.2l1.6 1.6M13.2 13.2l1.6 1.6M14.8 5.2l-1.6 1.6M6.8 13.2 5.2 14.8"/>',
  cookies: '<circle cx="10" cy="10" r="6.2"/><circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none"/><circle cx="12.2" cy="9.4" r="0.7" fill="currentColor" stroke="none"/><circle cx="9.2" cy="12.4" r="0.7" fill="currentColor" stroke="none"/>',
  dnt: '<path d="M4 10h12M10 4v12"/><circle cx="10" cy="10" r="6.2"/>',
  ua: '<circle cx="10" cy="10" r="6.2"/><path d="M3.8 10h12.4M10 3.8c1.8 1.8 2.6 3.8 2.6 6.2S11.8 14.4 10 16.2C8.2 14.4 7.4 12.4 7.4 10S8.2 5.6 10 3.8Z"/>',
  models: '<rect x="3.4" y="4.2" width="13.2" height="11.6" rx="2"/><path d="M7.2 8.2h5.6M7.2 11.2h3.8"/>',
  guvenlik: '<rect x="3.2" y="6.6" width="8.2" height="7.2" rx="1.2"/><path d="M11.4 8.6 16.6 6.4v9.6l-5.2-2.2"/><path d="M3.4 16.2 16.6 3.8"/>',
};

let settings = {};
let intel = null;
const removed = new Set();

const DEFAULTS = Object.freeze({
  blockTrackers: true,
  stripThirdPartyCookies: true,
  sendDnt: true,
  spoofUserAgent: true,
  ghostNetwork: false,
  mediaHunter: false,
  blockMedia: true,
});

function toolEnabled(tool) {
  if (!tool.setting) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(settings, tool.setting)) {
    return Boolean(settings[tool.setting]);
  }
  return Boolean(DEFAULTS[tool.setting]);
}

function iconSvg(name) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${ICONS[name] || ICONS.shield}</svg>`;
}

function modelDescription() {
  const models = Array.isArray(intel?.models) ? intel.models : [];
  const agents = Array.isArray(intel?.agents) ? intel.agents : [];
  const selected = models.find((item) => item.id === intel?.selectedId) || models.find((item) => item.live && item.ready);
  const running = agents.filter((item) => item.status === 'running');
  if (selected && running.length) {
    return `${selected.name} bağlı · ${running.map((item) => item.name).join(', ')}`;
  }
  if (selected) {
    return `${selected.name} bu oturuma bağlı.`;
  }
  if (running.length) {
    return running.map((item) => item.name).join(', ');
  }
  return 'Oturuma bağlı dil modeli ve ajan. Kalıcı uzantı değildir.';
}

function visibleTools(query) {
  const needle = String(query || '').trim().toLowerCase();
  return TOOLS.filter((tool) => {
    if (removed.has(tool.id)) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const hay = `${tool.name} ${tool.id} ${tool.description}`.toLowerCase();
    return hay.includes(needle);
  });
}

function renderGrid() {
  const grid = document.getElementById('ext-grid');
  const empty = document.getElementById('ext-empty');
  const query = document.getElementById('ext-query')?.value || '';
  if (!grid || !empty) {
    return;
  }

  const tools = visibleTools(query);
  empty.hidden = tools.length > 0;
  grid.replaceChildren();

  for (const tool of tools) {
    const card = document.createElement('article');
    card.className = 'ext-card';
    card.dataset.id = tool.id;

    const icon = document.createElement('div');
    icon.className = 'ext-icon';
    icon.innerHTML = iconSvg(tool.icon);

    const copy = document.createElement('div');
    copy.className = 'ext-copy';
    const title = document.createElement('h3');
    title.textContent = tool.id === 'models' ? (intel?.selectedId ? 'Yerel modeller' : tool.name) : tool.name;
    const desc = document.createElement('p');
    desc.textContent = tool.id === 'models' ? modelDescription() : tool.description;
    const idLine = document.createElement('p');
    idLine.className = 'ext-id';
    idLine.textContent = `oturum/${tool.id}`;
    copy.append(title, desc, idLine);

    const actions = document.createElement('div');
    actions.className = 'ext-actions';

    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'ext-btn';
    details.dataset.action = tool.action;
    details.textContent = 'Ayrıntılar';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ext-btn is-danger';
    remove.dataset.remove = tool.id;
    remove.textContent = 'Kaldır';

    actions.append(details, remove);

    if (tool.setting) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ext-switch';
      toggle.dataset.setting = tool.setting;
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', toolEnabled(tool) ? 'true' : 'false');
      toggle.setAttribute('aria-label', `${tool.name} açık/kapalı`);
      actions.append(toggle);
    }

    card.append(icon, copy, actions);
    grid.append(card);
  }
}

function setView(name) {
  const extensions = name !== 'shortcuts';
  document.getElementById('view-extensions')?.toggleAttribute('hidden', !extensions);
  document.getElementById('view-shortcuts')?.toggleAttribute('hidden', extensions);
  document.getElementById('nav-extensions')?.classList.toggle('is-active', extensions);
  document.getElementById('nav-shortcuts')?.classList.toggle('is-active', !extensions);
}

function bindPage() {
  document.getElementById('nav-toggle')?.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('is-nav-collapsed');
    document.getElementById('nav-toggle')?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  document.getElementById('dev-toggle')?.addEventListener('click', (event) => {
    const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
    event.currentTarget.setAttribute('aria-checked', on ? 'true' : 'false');
    document.body.classList.toggle('is-dev', on);
  });

  document.getElementById('ext-query')?.addEventListener('input', renderGrid);

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  document.getElementById('open-useful-links')?.addEventListener('click', () => {
    api?.openUsefulLinks?.();
  });

  document.getElementById('ext-grid')?.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn) {
      api?.toolsAction?.(actionBtn.dataset.action);
      return;
    }

    const removeBtn = event.target.closest('[data-remove]');
    if (removeBtn) {
      const tool = TOOLS.find((item) => item.id === removeBtn.dataset.remove);
      if (!tool) {
        return;
      }
      removed.add(tool.id);
      if (tool.setting) {
        api?.setSetting?.(tool.setting, false)?.then((result) => {
          if (result?.settings) {
            settings = result.settings;
          }
          renderGrid();
        });
      } else {
        renderGrid();
      }
      return;
    }

    const toggle = event.target.closest('[data-setting]');
    if (toggle) {
      const key = toggle.dataset.setting;
      const next = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', next ? 'true' : 'false');
      api?.setSetting?.(key, next)?.then((result) => {
        if (result?.settings) {
          settings = result.settings;
          renderGrid();
        }
      });
    }
  });

  api?.onSettings?.((next) => {
    if (next && typeof next === 'object') {
      settings = next;
      renderGrid();
    }
  });

  api?.onLocalIntel?.((next) => {
    intel = next || null;
    renderGrid();
  });

  api?.getSettings?.()?.then((result) => {
    if (result?.settings) {
      settings = result.settings;
      renderGrid();
    }
  });

  api?.getLocalIntel?.()?.then((result) => {
    intel = result?.intel || null;
    renderGrid();
  });

  renderGrid();
}

bindPage();
