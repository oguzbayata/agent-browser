'use strict';

const api = window.electronAPI;

const FALLBACK_CATALOG = Object.freeze([
  { id: 'mem0', name: 'Mem0', hint: 'Mem0 memory API', defaultUrl: 'http://127.0.0.1:8888/v1/memories', kind: 'http' },
  { id: 'zep', name: 'Zep', hint: 'Zep memory server', defaultUrl: 'http://127.0.0.1:8000/api/v2/memory', kind: 'http' },
  { id: 'langgraph', name: 'LangGraph / LangChain Memory', hint: 'LangGraph Studio / checkpoint', defaultUrl: 'http://127.0.0.1:2024/memory', kind: 'http' },
  { id: 'siyuan', name: 'SiYuan', hint: 'SiYuan kernel API', defaultUrl: 'http://127.0.0.1:6806/api/block/insertBlock', kind: 'http' },
  { id: 'llamaindex', name: 'LlamaIndex Memory Modules', hint: 'LlamaIndex memory service', defaultUrl: 'http://127.0.0.1:8001/memory', kind: 'http' },
  { id: 'motorhead', name: 'Motorhead', hint: 'Motorhead session memory', defaultUrl: 'http://127.0.0.1:8080/sessions', kind: 'http' },
  { id: 'memgpt', name: 'MemGPT', hint: 'Letta / MemGPT', defaultUrl: 'http://127.0.0.1:8283/v1/agents/memory', kind: 'http' },
  { id: 'obsidian', name: 'Obsidian', hint: 'Local vault folder', defaultUrl: '', kind: 'folder' },
]);

let state = {
  enabled: false,
  provider: 'siyuan',
  endpoint: '',
  hasToken: false,
  vaultPath: '',
  catalog: FALLBACK_CATALOG,
};

function catalog() {
  return Array.isArray(state.catalog) && state.catalog.length ? state.catalog : FALLBACK_CATALOG;
}

function selectedSpec() {
  return catalog().find((item) => item.id === state.provider) || catalog()[0];
}

function render() {
  const grid = document.getElementById('mem-grid');
  const status = document.getElementById('mem-status');
  const endpoint = document.getElementById('mem-endpoint');
  const token = document.getElementById('mem-token');
  const endpointRow = document.getElementById('mem-endpoint-row');
  const tokenRow = document.getElementById('mem-token-row');
  const vaultRow = document.getElementById('mem-vault-row');
  const vaultPath = document.getElementById('mem-vault-path');
  if (!grid) {
    return;
  }

  const spec = selectedSpec();
  const folder = spec?.kind === 'folder';
  grid.replaceChildren();
  for (const item of catalog()) {
    const card = document.createElement('article');
    card.className = item.id === state.provider ? 'ext-card mem-card is-selected' : 'ext-card mem-card';
    card.dataset.id = item.id;
    const copy = document.createElement('div');
    copy.className = 'ext-copy';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const desc = document.createElement('p');
    desc.textContent = item.hint || item.defaultUrl || '';
    copy.append(title, desc);
    card.append(copy);
    grid.append(card);
  }

  if (status) {
    const on = state.enabled ? 'on' : 'off';
    status.textContent = spec ? `${spec.name} selected · bridge ${on}` : 'no bridge selected';
  }
  if (endpointRow) {
    endpointRow.hidden = folder;
  }
  if (tokenRow) {
    tokenRow.hidden = folder;
  }
  if (vaultRow) {
    vaultRow.hidden = !folder;
  }
  if (endpoint && document.activeElement !== endpoint) {
    endpoint.value = state.endpoint || spec?.defaultUrl || '';
  }
  if (token && document.activeElement !== token && !token.value) {
    token.placeholder = state.hasToken ? 'a session key is stored · type to replace it' : 'this session only · not written to disk';
  }
  if (vaultPath) {
    vaultPath.textContent = state.vaultPath || 'no folder selected';
  }
}

function applySnapshot(next) {
  if (!next || typeof next !== 'object') {
    return;
  }
  state = {
    enabled: Boolean(next.enabled),
    provider: typeof next.provider === 'string' ? next.provider : 'siyuan',
    endpoint: typeof next.endpoint === 'string' ? next.endpoint : '',
    hasToken: Boolean(next.hasToken),
    vaultPath: typeof next.vaultPath === 'string' ? next.vaultPath : '',
    catalog: Array.isArray(next.catalog) && next.catalog.length ? next.catalog : FALLBACK_CATALOG,
  };
  render();
}

function bindPage() {
  document.getElementById('mem-grid')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card) {
      return;
    }
    const spec = catalog().find((item) => item.id === card.dataset.id);
    if (!spec) {
      return;
    }
    api?.setMemoryBridge?.({
      provider: spec.id,
      endpoint: spec.kind === 'folder' ? '' : spec.defaultUrl,
    })?.then((result) => {
      if (result?.bridge) {
        applySnapshot(result.bridge);
      }
    });
  });

  document.getElementById('mem-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const spec = selectedSpec();
    api?.setMemoryBridge?.({
      provider: spec?.id,
      endpoint: document.getElementById('mem-endpoint')?.value || '',
      token: document.getElementById('mem-token')?.value || undefined,
    })?.then((result) => {
      if (result?.bridge) {
        const token = document.getElementById('mem-token');
        if (token) {
          token.value = '';
        }
        applySnapshot(result.bridge);
      }
    });
  });

  document.getElementById('mem-pick-vault')?.addEventListener('click', () => {
    api?.pickMemoryVault?.()?.then((result) => {
      if (result?.bridge) {
        applySnapshot(result.bridge);
      }
    });
  });

  api?.onMemoryBridge?.(applySnapshot);
  api?.getMemoryBridge?.()?.then((result) => {
    if (result?.bridge) {
      applySnapshot(result.bridge);
    } else {
      render();
    }
  });
  render();
}

bindPage();
