'use strict';

const TRANSLATE_LANGS = Object.freeze([
  { id: 'tr', label: 'Turkish' },
  { id: 'de', label: 'German' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'French' },
  { id: 'es', label: 'Spanish' },
]);

const LANG_IDS = new Set(TRANSLATE_LANGS.map((item) => item.id));
const BATCH_CHARS = 3500;
const JOINER = '\n\u241E\n';
const NODE_LIMIT = 900;
const REQUEST_MS = 20000;

function normalizeLang(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return LANG_IDS.has(id) ? id : '';
}

function langLabel(id) {
  return TRANSLATE_LANGS.find((item) => item.id === id)?.label || id;
}

function parseGtxBody(body) {
  if (!Array.isArray(body) || !Array.isArray(body[0])) {
    return '';
  }
  return body[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
    .join('');
}

async function translatePlainText(text, targetLang) {
  const lang = normalizeLang(targetLang);
  const source = typeof text === 'string' ? text : '';
  if (!lang || !source.trim()) {
    return source;
  }

  const response = await fetch('https://translate.googleapis.com/translate_a/single', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: lang,
      dt: 't',
      q: source,
    }),
    signal: AbortSignal.timeout(REQUEST_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Translate HTTP ${response.status}`);
  }
  const translated = parseGtxBody(body);
  if (!translated.trim()) {
    throw new Error('The translator returned an empty result.');
  }
  return translated;
}

async function translateStrings(strings, targetLang) {
  const list = Array.isArray(strings) ? strings : [];
  const unique = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string' || !item.trim() || seen.has(item)) {
      continue;
    }
    seen.add(item);
    unique.push(item);
  }

  const map = new Map();
  let buf = [];
  let size = 0;

  const flush = async () => {
    if (!buf.length) {
      return;
    }
    const joined = buf.join(JOINER);
    const translated = await translatePlainText(joined, targetLang);
    const parts = translated.split(JOINER);
    for (let i = 0; i < buf.length; i += 1) {
      map.set(buf[i], typeof parts[i] === 'string' ? parts[i] : buf[i]);
    }
    buf = [];
    size = 0;
  };

  for (const item of unique) {
    if (size + item.length > BATCH_CHARS) {
      await flush();
    }
    buf.push(item);
    size += item.length + JOINER.length;
  }
  await flush();

  return list.map((item) => (typeof item === 'string' && map.has(item) ? map.get(item) : item));
}

const COLLECT_PAGE_SOURCE = `(() => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'SVG', 'MATH']);
  const root = document.body;
  if (!root) {
    return { texts: [], active: false };
  }
  if (!window.__agentTranslate) {
    window.__agentTranslate = { nodes: [], original: [], active: false };
  }
  const state = window.__agentTranslate;
  if (state.active && Array.isArray(state.original) && state.original.length) {
    return { texts: state.original.slice(), active: true };
  }
  const nodes = [];
  const texts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || skip.has(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue || !String(node.nodeValue).trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current && nodes.length < ${NODE_LIMIT}) {
    nodes.push(current);
    texts.push(current.nodeValue);
    current = walker.nextNode();
  }
  state.nodes = nodes;
  state.original = texts.slice();
  state.active = false;
  return { texts, active: false };
})()`;

function applyPageSource(translated) {
  return `(() => {
    const state = window.__agentTranslate;
    const next = ${JSON.stringify(Array.isArray(translated) ? translated : [])};
    if (!state || !Array.isArray(state.nodes)) {
      return false;
    }
    for (let i = 0; i < state.nodes.length && i < next.length; i += 1) {
      const node = state.nodes[i];
      if (node && typeof next[i] === 'string') {
        node.nodeValue = next[i];
      }
    }
    state.active = true;
    return true;
  })()`;
}

const RESTORE_PAGE_SOURCE = `(() => {
  const state = window.__agentTranslate;
  if (!state || !Array.isArray(state.nodes) || !Array.isArray(state.original)) {
    return false;
  }
  for (let i = 0; i < state.nodes.length && i < state.original.length; i += 1) {
    const node = state.nodes[i];
    if (node && typeof state.original[i] === 'string') {
      node.nodeValue = state.original[i];
    }
  }
  state.active = false;
  return true;
})()`;

const PAGE_ACTIVE_SOURCE = `Boolean(window.__agentTranslate && window.__agentTranslate.active)`;

function replaceSelectionSource(translated) {
  return `(() => {
    const text = ${JSON.stringify(String(translated || ''))};
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    selection.removeAllRanges();
    return true;
  })()`;
}

module.exports = {
  TRANSLATE_LANGS,
  normalizeLang,
  langLabel,
  translatePlainText,
  translateStrings,
  COLLECT_PAGE_SOURCE,
  applyPageSource,
  RESTORE_PAGE_SOURCE,
  PAGE_ACTIVE_SOURCE,
  replaceSelectionSource,
};
