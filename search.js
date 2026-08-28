'use strict';

const PYTHON_MISSING = 'Yerel İstihbarat Ajanı başlatılamadı: Python bulunamadı';
const PER_PAGE = 10;
const MAX_PAGES = 100;
const faviconByHost = new Map();
let allResults = [];
let currentPage = 1;

function queryFromLocation() {
  try {
    return (new URLSearchParams(window.location.search).get('q') || '').trim();
  } catch {
    return '';
  }
}

function setStatus(text) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = text || '';
  }
}

function showError(message) {
  const error = document.getElementById('error');
  if (!error) {
    return;
  }
  error.hidden = !message;
  error.textContent = message || '';
}

function hostKey(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function schemeOf(url) {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'https:') {
      return 'https';
    }
    if (protocol === 'http:') {
      return 'http';
    }
  } catch {
    // Ignore malformed result URLs.
  }
  return '';
}

function letterMark(url) {
  const host = hostKey(url) || '?';
  return (host[0] || '?').toUpperCase();
}

function mountFavicon(el, dataUrl) {
  if (!el || !dataUrl) {
    return;
  }
  el.textContent = '';
  el.classList.add('has-icon');
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => {
    el.classList.remove('has-icon');
    el.textContent = letterMark(el.dataset.url || '');
  });
  el.append(img);
}

function createFavicon(url) {
  const el = document.createElement('span');
  el.className = 'result-favicon';
  el.dataset.url = url;
  el.textContent = letterMark(url);
  const host = hostKey(url);
  const cached = (host && faviconByHost.get(host)) || '';
  if (cached) {
    mountFavicon(el, cached);
    return el;
  }
  window.electronAPI?.getFavicon?.(url)?.then((result) => {
    if (!result?.ok || !result.dataUrl) {
      return;
    }
    if (host) {
      faviconByHost.set(host, result.dataUrl);
    }
    mountFavicon(el, result.dataUrl);
  });
  return el;
}

function createLock(url) {
  const scheme = schemeOf(url);
  const mark = document.createElement('span');
  mark.className = 'result-lock';
  mark.dataset.scheme = scheme || 'unknown';
  mark.title = scheme === 'https' ? 'HTTPS · güvenilir bağlantı' : scheme === 'http' ? 'HTTP · güvenilir değil' : 'Bilinmeyen protokol';
  mark.setAttribute('aria-label', mark.title);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5.2 7.1V5.2a2.8 2.8 0 0 1 5.6 0v1.9');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '3.6');
  rect.setAttribute('y', '7.1');
  rect.setAttribute('width', '8.8');
  rect.setAttribute('height', '6.3');
  rect.setAttribute('rx', '1.4');
  svg.append(path, rect);
  mark.append(svg);
  return mark;
}

function pageCount(total) {
  return Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PER_PAGE)));
}

function renderPager(total, page) {
  const pager = document.getElementById('pager');
  if (!pager) {
    return;
  }
  pager.replaceChildren();
  const pages = pageCount(total);
  if (total <= PER_PAGE) {
    pager.hidden = true;
    return;
  }
  pager.hidden = false;

  const addButton = (label, target, options = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (options.current) {
      button.className = 'is-current';
      button.setAttribute('aria-current', 'page');
    }
    if (options.disabled || target < 1 || target > pages) {
      button.disabled = true;
    } else {
      button.addEventListener('click', () => showPage(target));
    }
    pager.append(button);
  };

  addButton('Geri', page - 1, { disabled: page <= 1 });
  for (let index = 1; index <= pages; index += 1) {
    addButton(String(index), index, { current: index === page });
  }
  addButton('İleri', page + 1, { disabled: page >= pages });
}

function renderResults(items) {
  const list = document.getElementById('results');
  if (!list) {
    return;
  }
  list.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'result';
    row.style.animationDelay = `${Math.min(index, 12) * 55}ms`;

    const head = document.createElement('div');
    head.className = 'result-head';
    const favicon = createFavicon(item.url);
    const lock = createLock(item.url);

    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    link.rel = 'noreferrer';

    head.append(favicon, lock, link);

    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = item.url;

    const snippet = document.createElement('p');
    snippet.className = 'snippet';
    snippet.textContent = item.snippet || '';

    row.append(head, url, snippet);
    list.append(row);
  });
}

function showPage(page) {
  const total = Math.min(allResults.length, MAX_PAGES * PER_PAGE);
  const pages = pageCount(total);
  currentPage = Math.min(Math.max(1, page), pages);
  const start = (currentPage - 1) * PER_PAGE;
  const slice = allResults.slice(start, start + PER_PAGE);
  renderResults(slice);
  renderPager(total, currentPage);
  if (total) {
    setStatus(`${total} sonuç · sayfa ${currentPage} / ${pages} · yerel stdout`);
  }
  window.scrollTo(0, 0);
}

async function run() {
  const query = queryFromLocation();
  const title = document.getElementById('query-title');
  if (title) {
    title.textContent = query || 'Arama';
    document.title = query ? query : 'Yerel Arama';
  }

  if (!query) {
    setStatus('');
    showError('Arama sorgusu boş.');
    return;
  }

  const api = window.electronAPI;
  if (!api || typeof api.runLocalSearch !== 'function') {
    setStatus('');
    showError(PYTHON_MISSING);
    return;
  }

  setStatus('Yerel ajan tarıyor…');
  showError('');

  let result;
  try {
    result = await api.runLocalSearch(query);
  } catch {
    setStatus('');
    showError(PYTHON_MISSING);
    return;
  }

  if (!result?.ok) {
    setStatus('');
    showError(result?.message || PYTHON_MISSING);
    return;
  }

  allResults = Array.isArray(result.results) ? result.results : [];
  if (allResults.length === 0) {
    setStatus('Sonuç yok. Ajan harici arama motoruna veri göndermedi.');
    renderResults([]);
    renderPager(0, 1);
    return;
  }

  showPage(1);
}

run();
