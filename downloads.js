'use strict';

const api = window.electronAPI;

const STATE_LABELS = {
  progressing: 'İndiriliyor',
  paused: 'Duraklatıldı',
  completed: 'Tamamlandı',
  cancelled: 'İptal edildi',
  interrupted: 'Kesildi',
};

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function stateLabel(state) {
  return STATE_LABELS[state] || String(state || 'bilinmiyor');
}

function renderDownloads(payload) {
  const list = document.getElementById('downloads-list');
  const empty = document.getElementById('downloads-empty');
  if (!list || !empty) {
    return;
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  empty.hidden = items.length > 0;
  list.replaceChildren();

  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'row';
    if (item.state) {
      row.dataset.state = item.state;
    }

    const copy = document.createElement('div');
    copy.className = 'row-copy';
    const name = document.createElement('h2');
    name.textContent = item.filename || 'indirilen';
    const meta = document.createElement('p');
    const percent = Math.round((Number(item.progress) || 0) * 100);
    const size =
      item.total > 0
        ? `${formatBytes(item.received)} / ${formatBytes(item.total)}`
        : formatBytes(item.received);
    const speed = item.state === 'progressing' && item.speed ? ` · ${item.speed}` : '';
    meta.textContent = `${stateLabel(item.state)} · ${size}${
      item.state === 'progressing' ? ` · %${percent}` : ''
    }${speed}`;
    copy.append(name, meta);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'İptal';
    cancel.setAttribute('aria-label', 'İndirmeyi iptal et');
    cancel.disabled = item.state !== 'progressing';
    cancel.addEventListener('click', () => api?.cancelDownload?.(item.id));

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.hidden = item.state !== 'progressing' && item.state !== 'paused';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    bar.append(fill);

    row.append(copy, cancel, bar);
    list.appendChild(row);
  }
}

api?.onDownloads?.((payload) => {
  renderDownloads(payload);
});
api?.onDiskWarning?.((payload) => {
  const banner = document.getElementById('disk-warning');
  if (!banner) {
    return;
  }
  banner.textContent =
    payload?.message ||
    'Uyarı: Bu dosya yerel diskinize kaydedildi. Excommunicado protokolü bu dosyayı silmeyebilir.';
  banner.hidden = false;
});
api?.getDownloads?.()?.then((result) => {
  if (result?.ok) {
    renderDownloads(result);
  }
});
