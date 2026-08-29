'use strict';

const api = window.electronAPI;

const STATE_LABELS = {
  progressing: 'Downloading',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
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
  return STATE_LABELS[state] || String(state || 'Unknown');
}

function canPreviewOpen(item) {
  return Boolean(item?.canOpen) && (item.kind === 'image' || item.kind === 'video' || item.kind === 'pdf');
}

function openSavedFile(downloadId) {
  if (typeof downloadId !== 'string' || !downloadId) {
    return;
  }
  api?.openDownload?.(downloadId);
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

    const name = canPreviewOpen(item)
      ? document.createElement('button')
      : document.createElement('h2');
    if (canPreviewOpen(item)) {
      name.type = 'button';
      name.className = 'row-name-open';
      name.setAttribute('aria-label', `Open ${item.filename || 'file'}`);
      name.addEventListener('click', () => openSavedFile(item.id));
    }
    name.textContent = item.filename || 'Download';

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
    if (item.error && item.state !== 'progressing') {
      meta.textContent += ` · ${item.error}`;
    }

    copy.append(name, meta);

    if (item.path) {
      const filePath = item.canOpen
        ? document.createElement('button')
        : document.createElement('p');
      filePath.className = item.canOpen ? 'row-path' : 'row-path is-static';
      filePath.textContent = item.path;
      filePath.title = item.path;
      if (item.canOpen) {
        filePath.type = 'button';
        filePath.setAttribute('aria-label', `Open ${item.path}`);
        filePath.addEventListener('click', () => openSavedFile(item.id));
      }
      copy.append(filePath);
    }

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (item.state === 'progressing') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.setAttribute('aria-label', 'Cancel download');
      cancel.addEventListener('click', () => api?.cancelDownload?.(item.id));
      actions.append(cancel);
    } else if (item.canOpen) {
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open';
      open.setAttribute('aria-label', `Open ${item.filename || 'file'}`);
      open.addEventListener('click', () => openSavedFile(item.id));
      actions.append(open);
    }

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.hidden = item.state !== 'progressing' && item.state !== 'paused';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    bar.append(fill);

    row.append(copy, actions, bar);
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
    'Warning: This file was saved to your local disk. The Excommunicado protocol may not delete it.';
  banner.hidden = false;
});
api?.onToast?.((payload) => {
  const banner = document.getElementById('disk-warning');
  if (!banner || !payload?.message) {
    return;
  }
  banner.textContent = payload.message;
  banner.hidden = false;
});
api?.getDownloads?.()?.then((result) => {
  if (result?.ok) {
    renderDownloads(result);
  }
});
