'use strict';

const api = window.electronAPI;

let settings = {};
let intel = null;

function setView(name) {
  const extensions = name !== 'shortcuts';
  document.getElementById('view-extensions')?.toggleAttribute('hidden', !extensions);
  document.getElementById('view-shortcuts')?.toggleAttribute('hidden', extensions);
  document.getElementById('nav-extensions')?.classList.toggle('is-active', extensions);
  document.getElementById('nav-shortcuts')?.classList.toggle('is-active', !extensions);
}

function updateExpertMeta() {
  const meta = document.getElementById('ext-expert-meta');
  if (!meta) {
    return;
  }
  const models = Array.isArray(intel?.models) ? intel.models : [];
  const selected = models.find((item) => item.id === intel?.selectedId) || models.find((item) => item.live && item.ready);
  const modelLine = selected ? selected.name : 'no model selected';
  const brainOn = settings?.brain === 'siyuan' || settings?.brain === 'obsidian' || Boolean(settings?.siyuanBridge);
  const memoryName = settings?.memoryBridge?.providerName || 'none';
  const memoryLine = brainOn ? `agent memory: ${memoryName}` : `memory: ${memoryName} · off`;
  meta.textContent = `${modelLine} · ${memoryLine}`;
}

function appendExpertBubble(role, text) {
  const chat = document.getElementById('ext-expert-chat');
  if (!chat || !text) {
    return;
  }
  const bubble = document.createElement('p');
  bubble.className = `ext-expert-bubble is-${role}`;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

function setExpertBusy(busy) {
  const send = document.getElementById('ext-expert-send');
  const prompt = document.getElementById('ext-expert-prompt');
  if (send) {
    send.disabled = Boolean(busy);
  }
  if (prompt) {
    prompt.disabled = Boolean(busy);
  }
}

function refreshCatalog(nextSettings) {
  if (nextSettings && typeof nextSettings === 'object') {
    settings = nextSettings;
  }
  updateExpertMeta();
  if (typeof window.renderExtensions === 'function') {
    window.renderExtensions();
  }
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

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  document.getElementById('ext-expert-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const prompt = document.getElementById('ext-expert-prompt');
    const message = String(prompt?.value || '').trim();
    if (!message) {
      return;
    }
    appendExpertBubble('user', message);
    if (prompt) {
      prompt.value = '';
    }
    setExpertBusy(true);
    const request = api?.askExtExpert?.(message);
    if (!request) {
      appendExpertBubble('error', 'The extension expert is not bound. Open this inside Agent Browser.');
      setExpertBusy(false);
      return;
    }
    request
      .then((result) => {
        if (result?.settings) {
          refreshCatalog(result.settings);
        }
        if (result?.ok && result.reply) {
          appendExpertBubble('agent', result.reply);
        } else {
          appendExpertBubble('error', result?.error || 'The extension expert could not reply. Is a local model selected?');
        }
      })
      ?.catch(() => {
        appendExpertBubble('error', 'The extension expert could not reply.');
      })
      ?.finally(() => {
        setExpertBusy(false);
      });
  });

  document.getElementById('ext-expert-prompt')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('ext-expert-form')?.requestSubmit();
    }
  });

  document.getElementById('open-useful-links')?.addEventListener('click', () => {
    api?.openUsefulLinks?.();
  });

  appendExpertBubble(
    'agent',
    'Hi, I am the Extension expert. Tell me which sites you use and I will turn the right tools on or off for ads, privacy, downloads, or scraping.',
  );

  api?.onSettings?.((next) => {
    if (next && typeof next === 'object') {
      refreshCatalog(next);
    }
  });

  api?.onLocalIntel?.((next) => {
    intel = next || null;
    updateExpertMeta();
  });

  api?.getSettings?.()?.then((result) => {
    if (result?.settings) {
      refreshCatalog(result.settings);
    }
  });

  api?.getLocalIntel?.()?.then((result) => {
    intel = result?.intel || null;
    updateExpertMeta();
  });

  updateExpertMeta();
}

bindPage();
