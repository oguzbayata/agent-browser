'use strict';

const api = window.electronAPI;

let currentUrl = '';
let copyReset = 0;

function applySite(info) {
  if (!info || typeof info !== 'object') {
    return;
  }
  currentUrl = typeof info.url === 'string' ? info.url : '';
  const host = document.getElementById('site-host');
  const meta = document.getElementById('site-scheme');
  const badge = document.getElementById('site-scheme-badge');
  if (host) {
    host.textContent = typeof info.host === 'string' && info.host ? info.host : 'sayfa yok';
  }
  if (meta) {
    meta.textContent =
      typeof info.meta === 'string' && info.meta ? info.meta : 'Adres çubuğundan bir hedef açın.';
  }
  if (badge) {
    badge.textContent = typeof info.scheme === 'string' && info.scheme ? info.scheme : 'ram';
  }
}

function refreshSite() {
  api?.getSiteInfo?.()?.then((result) => {
    if (result?.ok) {
      applySite(result);
    }
  });
}

function bindSiteMenu() {
  const menu = document.getElementById('agent-site-menu');
  const copyLabel = document.getElementById('site-copy-label');
  if (!menu) {
    return;
  }

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-action]');
    if (!item) {
      return;
    }
    const action = item.dataset.action;
    if (action === 'copy') {
      if (!currentUrl) {
        return;
      }
      api?.writeClipboard?.(currentUrl)?.then((result) => {
        if (!result?.ok || !copyLabel) {
          return;
        }
        copyLabel.textContent = 'Kopyalandı';
        const token = Date.now();
        copyReset = token;
        setTimeout(() => {
          if (copyReset === token && copyLabel) {
            copyLabel.textContent = 'Adresi kopyala';
          }
        }, 1200);
      });
      return;
    }
    if (action === 'reload') {
      api?.reload?.();
      api?.setSiteOpen?.(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setSiteOpen?.(false);
    }
  });

  api?.onSiteInfo?.(applySite);
  api?.onUrlChanged?.(() => {
    refreshSite();
  });
  refreshSite();
}

bindSiteMenu();
