'use strict';

const PYTHON_MISSING = 'Yerel İstihbarat Ajanı başlatılamadı: Python bulunamadı';

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

    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    link.rel = 'noreferrer';

    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = item.url;

    const snippet = document.createElement('p');
    snippet.className = 'snippet';
    snippet.textContent = item.snippet || '';

    row.append(link, url, snippet);
    list.append(row);
  });
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

  const items = Array.isArray(result.results) ? result.results : [];
  if (items.length === 0) {
    setStatus('Sonuç yok. Ajan harici arama motoruna veri göndermedi.');
    renderResults([]);
    return;
  }

  setStatus(`${items.length} sonuç · yerel stdout`);
  renderResults(items);
}

run();
