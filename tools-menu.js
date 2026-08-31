'use strict';

const api = window.electronAPI;

function applyBoundAgent(intel) {
  const card = document.getElementById('bound-agent-card');
  const modelName = document.getElementById('bound-model-name');
  const modelMeta = document.getElementById('bound-model-meta');
  const agentMeta = document.getElementById('bound-agent-meta');
  if (!card || !modelName || !modelMeta || !agentMeta) {
    return;
  }

  const models = Array.isArray(intel?.models) ? intel.models : [];
  const agents = Array.isArray(intel?.agents) ? intel.agents : [];
  const selected = models.find((item) => item.id === intel?.selectedId) || null;
  const live = models.find((item) => item.live && item.ready) || null;
  const model = selected || live;
  const running = agents.filter((item) => item.status === 'running');

  if (model) {
    modelName.textContent = model.name || 'Local model';
    modelMeta.textContent = [model.source || model.runtime, model.live ? 'live' : model.kind === 'file' ? 'file' : 'selected']
      .filter(Boolean)
      .join(' · ');
  } else {
    modelName.textContent = 'No language model bound';
    modelMeta.textContent = 'Bind one in Settings → Agents';
  }

  if (running.length) {
    agentMeta.textContent = running
      .map((item) => (item.detail ? `${item.name} · ${item.detail}` : item.name))
      .join(' · ');
  } else {
    agentMeta.textContent = 'No agent bound';
  }

  card.classList.toggle('is-live', Boolean((model && model.live) || running.length));
}

function bindToolsMenu() {
  const menu = document.getElementById('agent-tools-menu');
  if (!menu) {
    return;
  }

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-tools]');
    if (!item) {
      return;
    }
    api?.toolsAction?.(item.dataset.tools);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setToolsOpen?.(false);
    }
  });

  api?.onLocalIntel?.(applyBoundAgent);
}

bindToolsMenu();
