'use strict';

const api = window.electronAPI;

const TOOLS = Object.freeze([
  {
    id: 'shield',
    setting: 'blockTrackers',
    name: 'Shield',
    description: 'Cuts Google, Meta, Amazon, and other major ad networks, including overlay ads on adult sites. Lives only in this RAM session.',
    action: 'shield',
    icon: 'shield',
  },
  {
    id: 'ghost',
    setting: 'ghostNetwork',
    name: 'Ghost Network',
    description: 'Routes traffic through a SOCKS5 proxy and cuts camera, location, and screen sharing.',
    action: 'ghost',
    icon: 'ghost',
  },
  {
    id: 'guvenlik',
    setting: 'blockMedia',
    name: 'Security V1',
    description: 'Automatically turns off the computer microphone and camera (video, photos, and other media).',
    action: 'settings',
    icon: 'guvenlik',
  },
  {
    id: 'hunter',
    setting: 'mediaHunter',
    name: 'Universal Media Hunter (Video Downloader)',
    description: 'Download HTML5 and YouTube videos from the context menu.',
    action: 'downloads',
    icon: 'hunter',
  },
  {
    id: 'cookies',
    setting: 'stripThirdPartyCookies',
    name: 'Cookie cutter',
    description: 'Drops third-party cookies; the session is not written to disk.',
    action: 'settings',
    icon: 'cookies',
  },
  {
    id: 'dnt',
    setting: 'sendDnt',
    name: 'Do Not Track',
    description: 'Adds a DNT header to outgoing requests.',
    action: 'settings',
    icon: 'dnt',
  },
  {
    id: 'ua',
    setting: 'spoofUserAgent',
    name: 'Identity mask',
    description: 'Sends a common Chrome user agent to reduce fingerprinting.',
    action: 'settings',
    icon: 'ua',
  },
  {
    id: 'models',
    setting: null,
    name: 'Local models',
    description: 'Session-bound language model and agent. Not a persistent extension.',
    action: 'models',
    icon: 'models',
  },
  {
    id: 'canvas-poisoner',
    setting: 'canvasPoisoner',
    extId: 'canvas-poisoner',
    name: 'Canvas & WebGL Poisoner',
    description: 'Adds micro-noise to pixel drawings to break hardware fingerprinting.',
    action: 'settings',
    icon: 'canvas',
  },
  {
    id: 'siyuan-bridge',
    setting: 'siyuanBridge',
    extId: 'siyuan-bridge',
    name: 'Memory Bridge',
    description: 'Choose Mem0, Zep, LangGraph, SiYuan, LlamaIndex, Motorhead, MemGPT, or Obsidian from Details.',
    action: 'memory-bridge',
    icon: 'siyuan',
  },
  {
    id: 'human-jitter',
    setting: 'humanJitter',
    extId: 'human-jitter',
    name: 'Ghost Mouse (Human Jitter)',
    description: 'Adds human-like randomness and scroll delays to autonomous clicks.',
    action: 'settings',
    icon: 'jitter',
  },
  {
    id: 'dead-man-switch',
    setting: 'deadManSwitch',
    extId: 'dead-man-switch',
    name: 'Protocol Switch',
    description: 'Autonomously triggers the Excommunicado protocol when the gateway changes.',
    action: 'settings',
    icon: 'deadman',
    alert: true,
  },
  {
    id: 'web3-shield',
    setting: 'web3Shield',
    extId: 'web3-shield',
    name: 'Web3 Crypto Shield',
    description: 'Isolates DApp connections and blocks unauthorized wallet probes.',
    action: 'settings',
    icon: 'web3',
  },
  {
    id: 'shadow-dom-pierce',
    setting: 'shadowDomPierce',
    extId: 'shadow-dom-pierce',
    category: 'scrape',
    name: 'Shadow DOM Piercer',
    description: 'Opens closed web components (shadow-root) for agents.',
    action: 'settings',
    icon: 'drill',
  },
  {
    id: 'markdown-dom',
    setting: 'markdownDom',
    extId: 'markdown-dom',
    category: 'scrape',
    name: 'Markdown DOM Translator',
    description: 'Turns complex HTML into clean Markdown that agents can read easily.',
    action: 'settings',
    icon: 'text',
  },
  {
    id: 'ui-code-extract',
    setting: 'uiCodeExtract',
    extId: 'ui-code-extract',
    category: 'scrape',
    name: 'UI & Code Extractor',
    description: 'Analyzes selected page sections’ React, HTML, and Tailwind classes and hands agents a code block.',
    action: 'settings',
    icon: 'code',
  },
  {
    id: 'infinite-scroll',
    setting: 'infiniteScroll',
    extId: 'infinite-scroll',
    category: 'scrape',
    name: 'Infinite Scroll Autonomy',
    description: 'Automatically scrolls down infinite-scroll pages such as Twitter/Reddit for agents.',
    action: 'settings',
    icon: 'arrows',
  },
  {
    id: 'table-parser',
    setting: 'tableParser',
    extId: 'table-parser',
    category: 'scrape',
    name: 'Table & Grid Parser',
    description: 'Turns complex data tables into plain JSON arrays instantly.',
    action: 'settings',
    icon: 'table',
  },
  {
    id: 'xhr-hunter',
    setting: 'xhrHunter',
    extId: 'xhr-hunter',
    category: 'network',
    name: 'XHR & WebSocket Hunter',
    description: 'Captures live background API responses (markets, crypto, and similar) without waiting on the page UI.',
    action: 'settings',
    icon: 'wave',
  },
  {
    id: 'json-form-fill',
    setting: 'jsonFormFill',
    extId: 'json-form-fill',
    category: 'network',
    name: 'Automatic JSON Form Filler',
    description: 'Maps raw JSON from agents onto complex page input fields.',
    action: 'settings',
    icon: 'form',
  },
  {
    id: 'proxy-rotate',
    setting: 'proxyRotate',
    extId: 'proxy-rotate',
    category: 'network',
    name: 'Dynamic Proxy Rotator',
    description: 'Rotates the proxy tunnel from the session SOCKS list whenever an agent opens a new tab.',
    action: 'settings',
    icon: 'globe',
  },
  {
    id: 'webgl-inspector',
    setting: 'webglInspector',
    extId: 'webgl-inspector',
    category: 'network',
    name: '3D/WebGL Asset Inspector',
    description: 'Parses metadata from rendered canvas and 3D objects for agents.',
    action: 'settings',
    icon: 'cube',
  },
  {
    id: 'media-source',
    setting: 'mediaSourceReveal',
    extId: 'media-source',
    category: 'network',
    name: 'Media Source Revealer',
    description: 'Finds the real source URLs of video/audio files hidden as embeds or Blobs.',
    action: 'settings',
    icon: 'eye',
  },
  {
    id: 'n8n-webhook',
    setting: 'n8nWebhook',
    extId: 'n8n-webhook',
    category: 'local',
    name: 'n8n Webhook Trigger',
    description: 'POSTs to local n8n workflows when selected page events fire (for example a price change).',
    action: 'settings',
    icon: 'node',
  },
  {
    id: 'lm-studio-port',
    setting: 'lmStudioPort',
    extId: 'lm-studio-port',
    category: 'local',
    name: 'LM Studio Port',
    description: 'Summarizes large texts on a local LLM at localhost before sending them to the agent, cutting traffic.',
    action: 'settings',
    icon: 'chip',
  },
  {
    id: 'memory-block',
    setting: 'memoryBlockSync',
    extId: 'memory-block',
    category: 'local',
    name: 'Memory Block Sync',
    description: 'Syncs critical findings directly into local block-based memory systems such as SiYuan.',
    action: 'settings',
    icon: 'book',
  },
  {
    id: 'cursor-ide-bridge',
    setting: 'cursorIdeBridge',
    extId: 'cursor-ide-bridge',
    category: 'local',
    name: 'Cursor IDE Code Bridge',
    description: 'Forwards scraped technical docs or code snippets into the local workspace.',
    action: 'settings',
    icon: 'terminal',
  },
  {
    id: 'tab-orchestrator',
    setting: 'tabOrchestrator',
    extId: 'tab-orchestrator',
    category: 'control',
    name: 'Multi-Tab Orchestrator',
    description: 'Manages and sleeps 10+ tabs for parallel agents without leaking memory.',
    action: 'settings',
    icon: 'layers',
  },
  {
    id: 'headless-mode',
    setting: 'headlessMode',
    extId: 'headless-mode',
    category: 'control',
    name: 'Headless (Invisible) Mode',
    description: 'Stops BrowserView rendering while agents run to cut CPU/GPU use.',
    action: 'settings',
    icon: 'ghost2',
  },
  {
    id: 'input-simulator',
    setting: 'inputSimulator',
    extId: 'input-simulator',
    category: 'control',
    name: 'Mouse & Keyboard Simulator',
    description: 'Applies CDP actions as if they were real hardware input, with human-like delays.',
    action: 'settings',
    icon: 'keyboard',
  },
  {
    id: 'rate-limit-guard',
    setting: 'rateLimitGuard',
    extId: 'rate-limit-guard',
    category: 'control',
    name: 'Rate-Limit Guard',
    description: 'Detects Cloudflare or reCAPTCHA v3 wait times and autonomously pauses agent actions.',
    action: 'settings',
    icon: 'guard',
  },
  {
    id: 'sandbox-isolator',
    setting: 'sandboxIsolator',
    extId: 'sandbox-isolator',
    category: 'control',
    name: 'Sandbox Task Isolator',
    description: 'Runs each agent task in a different in-memory-session partition so cross-task data does not leak.',
    action: 'settings',
    icon: 'box',
  },
  {
    id: 'excommunicado-lock',
    setting: 'excommunicadoLock',
    extId: 'excommunicado-lock',
    category: 'control',
    name: 'Excommunicado Lock',
    description: 'If agents enter an error loop, destroys that tab and sends a Failed signal to the master system.',
    action: 'settings',
    icon: 'lock',
    alert: true,
  },
]);

const CATEGORY_LABELS = Object.freeze({
  scrape: 'Data scraping and DOM manipulation',
  network: 'Network and data capture',
  local: 'Local system integrations',
  control: 'Agent control and security',
});

const ICONS = {
  shield: '<path d="M10 2.6 16.2 5.2v4.4c0 4.1-2.5 6.9-6.2 8.1C6.3 16.5 3.8 13.7 3.8 9.6V5.2Z" />',
  ghost:
    '<path d="M10 3.2c-2.8 0-5 2-5 4.8v6.2l1.6-1.1 1.6 1.1 1.8-1.1 1.8 1.1 1.6-1.1 1.6 1.1V8c0-2.8-2.2-4.8-5-4.8z"/><circle cx="8" cy="8.4" r="0.8" fill="currentColor" stroke="none"/><circle cx="12" cy="8.4" r="0.8" fill="currentColor" stroke="none"/>',
  hunter: '<rect x="3.4" y="5.2" width="13.2" height="9.6" rx="1.6"/><path d="M8.2 8.2 12.4 10l-4.2 1.8z"/>',
  cookies: '<circle cx="10" cy="10" r="6.2"/><circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none"/><circle cx="12.2" cy="9.4" r="0.7" fill="currentColor" stroke="none"/><circle cx="9.2" cy="12.4" r="0.7" fill="currentColor" stroke="none"/>',
  dnt: '<path d="M4 10h12M10 4v12"/><circle cx="10" cy="10" r="6.2"/>',
  ua: '<circle cx="10" cy="10" r="6.2"/><path d="M3.8 10h12.4M10 3.8c1.8 1.8 2.6 3.8 2.6 6.2S11.8 14.4 10 16.2C8.2 14.4 7.4 12.4 7.4 10S8.2 5.6 10 3.8Z"/>',
  models: '<rect x="3.4" y="4.2" width="13.2" height="11.6" rx="2"/><path d="M7.2 8.2h5.6M7.2 11.2h3.8"/>',
  guvenlik: '<rect x="3.2" y="6.6" width="8.2" height="7.2" rx="1.2"/><path d="M11.4 8.6 16.6 6.4v9.6l-5.2-2.2"/><path d="M3.4 16.2 16.6 3.8"/>',
  canvas: '<path d="M4.2 14.8 13.4 5.6a2 2 0 0 1 2.8 2.8L7 17.6H4.2z"/><path d="M12.2 6.8 14.8 9.4"/>',
  siyuan: '<circle cx="7.2" cy="8" r="2.4"/><circle cx="13.2" cy="12.4" r="2.4"/><path d="M9.2 9.4 11.2 11"/>',
  jitter: '<path d="M8.2 3.2 11 9.4 8.8 9.8 11.6 16.8"/><path d="M13.2 6.2c1.4.8 2.2 2 2.2 3.6s-.8 2.8-2.2 3.6"/>',
  deadman: '<circle cx="10" cy="8.4" r="3.4"/><path d="M7.4 11.6 5.2 16.4M12.6 11.6 14.8 16.4M6.4 8.2h7.2"/>',
  web3: '<circle cx="10" cy="10" r="6.2"/><path d="M10 3.8v12.4M4.4 8.2h11.2M4.4 11.8h11.2"/>',
  drill: '<path d="M4.2 5.2h7.2L14 8.4v2.2H8.6zM8.6 10.6v5.2M6.6 15.8h4"/><circle cx="15.4" cy="7.2" r="1.4"/>',
  text: '<path d="M5 5.2h10M10 5.2v9.6M7.2 14.8h5.6"/>',
  code: '<path d="M7.2 6.4 3.8 10l3.4 3.6M12.8 6.4 16.2 10l-3.4 3.6M11.2 5.2 8.8 14.8"/>',
  arrows: '<path d="M10 3.4v13.2M6.4 13.2 10 16.6 13.6 13.2M6.4 6.8 10 3.4 13.6 6.8"/>',
  table: '<rect x="3.4" y="4.4" width="13.2" height="11.2" rx="1.2"/><path d="M3.4 8.2h13.2M3.4 12h13.2M8.2 4.4v11.2M11.8 4.4v11.2"/>',
  wave: '<path d="M3.2 10c1.6-3.2 3.2-3.2 4.8 0s3.2 3.2 4.8 0 3.2-3.2 4.8 0"/>',
  form: '<rect x="4" y="3.6" width="12" height="12.8" rx="1.4"/><path d="M6.6 7.2h6.8M6.6 10h6.8M6.6 12.8h4.2"/>',
  globe: '<circle cx="10" cy="10" r="6.2"/><path d="M3.8 10h12.4M10 3.8c1.8 1.8 2.6 3.8 2.6 6.2S11.8 14.4 10 16.2C8.2 14.4 7.4 12.4 7.4 10S8.2 5.6 10 3.8Z"/>',
  cube: '<path d="M10 3.4 16.2 7v6L10 16.6 3.8 13V7Z"/><path d="M10 16.6V10M3.8 7 10 10l6.2-3"/>',
  eye: '<path d="M3.4 10C5.2 6.8 7.4 5.2 10 5.2S14.8 6.8 16.6 10C14.8 13.2 12.6 14.8 10 14.8S5.2 13.2 3.4 10Z"/><circle cx="10" cy="10" r="2.2"/>',
  node: '<circle cx="5.2" cy="6.2" r="2"/><circle cx="14.8" cy="6.2" r="2"/><circle cx="10" cy="14.4" r="2"/><path d="M6.8 7.4 8.6 12.6M13.2 7.4 11.4 12.6M7.2 6.2h5.6"/>',
  chip: '<rect x="6" y="6" width="8" height="8" rx="1.2"/><path d="M10 3.4v2.6M10 14v2.6M3.4 10h2.6M14 10h2.6M5.2 5.2l1.6 1.6M13.2 13.2l1.6 1.6M14.8 5.2l-1.6 1.6M6.8 13.2 5.2 14.8"/>',
  book: '<path d="M4.4 4.4h5.2c1.2 0 2 .8 2 2v9.2H6.4c-1.2 0-2-.8-2-2zM15.6 4.4H10.4c-1.2 0-2 .8-2 2v9.2h5.2c1.2 0 2-.8 2-2z"/>',
  terminal: '<rect x="3.2" y="4.4" width="13.6" height="11.2" rx="1.4"/><path d="M6 8.2 8.2 10 6 11.8M10.2 12.2h3.6"/>',
  layers: '<path d="M10 3.6 16.4 7 10 10.4 3.6 7Z"/><path d="M3.6 10 10 13.4 16.4 10M3.6 13 10 16.4 16.4 13"/>',
  ghost2:
    '<path d="M10 3.4c-2.8 0-5 2-5 4.6v6.4l1.6-1 1.6 1 1.8-1 1.8 1 1.6-1 1.6 1V8c0-2.6-2.2-4.6-5-4.6z"/><circle cx="8" cy="8.4" r="0.8" fill="currentColor" stroke="none"/><circle cx="12" cy="8.4" r="0.8" fill="currentColor" stroke="none"/>',
  keyboard: '<rect x="2.8" y="5.6" width="14.4" height="8.8" rx="1.4"/><path d="M5.4 8.2h1.2M8.2 8.2h1.2M11 8.2h1.2M13.6 8.2h1M5.4 11h9.2"/>',
  guard: '<path d="M10 2.8 16.4 5.4v4.2c0 4-2.6 6.8-6.4 8-3.8-1.2-6.4-4-6.4-8V5.4Z"/><path d="M7.4 10.2 9.2 12l3.6-4"/>',
  box: '<rect x="3.6" y="5.2" width="12.8" height="10.4" rx="1.4"/><path d="M3.6 8.4h12.8M10 5.2v10.4"/>',
  lock: '<rect x="5.2" y="9" width="9.6" height="7.2" rx="1.2"/><path d="M7.2 9V7.2a2.8 2.8 0 0 1 5.6 0V9"/>',
};

window.agentExtensions = {};

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
  canvasPoisoner: false,
  siyuanBridge: false,
  humanJitter: false,
  deadManSwitch: false,
  web3Shield: false,
  shadowDomPierce: false,
  markdownDom: false,
  uiCodeExtract: false,
  infiniteScroll: false,
  tableParser: false,
  xhrHunter: false,
  jsonFormFill: false,
  proxyRotate: false,
  webglInspector: false,
  mediaSourceReveal: false,
  n8nWebhook: false,
  lmStudioPort: false,
  memoryBlockSync: false,
  cursorIdeBridge: false,
  tabOrchestrator: false,
  headlessMode: false,
  inputSimulator: false,
  rateLimitGuard: false,
  sandboxIsolator: false,
  excommunicadoLock: false,
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

function memoryBridgeDescription() {
  const name = settings?.memoryBridge?.providerName;
  if (name) {
    return `${name} is bound to this session. Change the bridge from Details.`;
  }
  return 'Choose Mem0, Zep, LangGraph, SiYuan, LlamaIndex, Motorhead, MemGPT, or Obsidian from Details.';
}

function modelDescription() {
  const models = Array.isArray(intel?.models) ? intel.models : [];
  const agents = Array.isArray(intel?.agents) ? intel.agents : [];
  const selected = models.find((item) => item.id === intel?.selectedId) || models.find((item) => item.live && item.ready);
  const running = agents.filter((item) => item.status === 'running');
  if (selected && running.length) {
    return `${selected.name} bound · ${running.map((item) => item.name).join(', ')}`;
  }
  if (selected) {
    return `${selected.name} is bound to this session.`;
  }
  if (running.length) {
    return running.map((item) => item.name).join(', ');
  }
  return 'Session-bound language model and agent. Not a persistent extension.';
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
    const hay = `${tool.name} ${tool.id} ${tool.description} ${CATEGORY_LABELS[tool.category] || ''}`.toLowerCase();
    return hay.includes(needle);
  });
}

function installedCount() {
  return TOOLS.filter((tool) => !removed.has(tool.id)).length;
}

function syncAgentExtensions() {
  const next = {};
  for (const tool of TOOLS) {
    if (tool.setting) {
      next[tool.id] = toolEnabled(tool);
    }
  }
  window.agentExtensions = next;
}

function updateExtensionCounts(visible) {
  const total = installedCount();
  const heading = document.getElementById('ext-heading');
  if (heading) {
    heading.textContent = visible === total ? `All extensions (${total})` : `All extensions (${visible} / ${total})`;
  }
  const navCount = document.getElementById('ext-nav-count');
  if (navCount) {
    navCount.textContent = String(total);
  }
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
  updateExtensionCounts(tools.length);
  grid.replaceChildren();
  let lastCategory = null;

  for (const tool of tools) {
    if (tool.category && tool.category !== lastCategory) {
      lastCategory = tool.category;
      const heading = document.createElement('h3');
      heading.className = 'ext-group';
      heading.textContent = CATEGORY_LABELS[tool.category] || tool.category;
      grid.append(heading);
    }

    const card = document.createElement('article');
    card.className = tool.alert ? 'ext-card is-alert' : 'ext-card';
    card.dataset.id = tool.id;

    const icon = document.createElement('div');
    icon.className = 'ext-icon';
    icon.innerHTML = iconSvg(tool.icon);

    const copy = document.createElement('div');
    copy.className = 'ext-copy';
    const title = document.createElement('h3');
    title.textContent = tool.id === 'models' ? (intel?.selectedId ? 'Local models' : tool.name) : tool.name;
    const desc = document.createElement('p');
    desc.textContent =
      tool.id === 'models' ? modelDescription() : tool.id === 'siyuan-bridge' ? memoryBridgeDescription() : tool.description;
    const idLine = document.createElement('p');
    idLine.className = 'ext-id';
    idLine.textContent = `session/${tool.id}`;
    copy.append(title, desc, idLine);

    const actions = document.createElement('div');
    actions.className = 'ext-actions';

    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'ext-btn';
    details.dataset.action = tool.action;
    details.textContent = 'Details';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ext-btn is-danger';
    remove.dataset.remove = tool.id;
    remove.textContent = 'Remove';

    actions.append(details, remove);

    if (tool.setting) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ext-switch';
      toggle.dataset.setting = tool.setting;
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', toolEnabled(tool) ? 'true' : 'false');
      toggle.setAttribute('aria-label', `${tool.name} on/off`);
      if (tool.extId) {
        toggle.dataset.ext = tool.extId;
      }
      actions.append(toggle);
    }

    card.append(icon, copy, actions);
    grid.append(card);
  }
  syncAgentExtensions();
  updateExpertMeta();
}

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
  const memoryLine = settings?.memoryBridge?.providerName
    ? `memory: ${settings.memoryBridge.providerName}${settings.siyuanBridge ? '' : ' · off'}`
    : 'no memory bridge selected';
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
          settings = result.settings;
          renderGrid();
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
      const apply = (result) => {
        if (result?.settings) {
          settings = result.settings;
          renderGrid();
        }
      };
      if (toggle.dataset.ext) {
        api?.updateAgentExtension?.(toggle.dataset.ext, next);
        api?.toggleExtension?.(toggle.dataset.ext, next)?.then(apply);
      } else {
        api?.setSetting?.(key, next)?.then(apply);
      }
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
