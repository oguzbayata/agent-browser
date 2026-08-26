'use strict';

const api = window.electronAPI;

function bindOverflowMenu() {
  const menu = document.getElementById('agent-main-menu');
  const zoomLabel = document.getElementById('zoom-label');
  const defaultBanner = document.getElementById('menu-default-browser');
  if (!menu) {
    return;
  }

  async function applyZoom(action) {
    const result = await api?.setZoom?.(action);
    if (result?.ok && zoomLabel) {
      zoomLabel.textContent = `${result.zoom}%`;
    }
  }

  document.getElementById('zoom-out')?.addEventListener('click', (event) => {
    event.stopPropagation();
    applyZoom('out');
  });
  document.getElementById('zoom-in')?.addEventListener('click', (event) => {
    event.stopPropagation();
    applyZoom('in');
  });

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-action]');
    if (!item) {
      return;
    }
    const action = item.dataset.action;
    if (action === 'default-browser') {
      defaultBanner?.remove();
      return;
    }
    api?.menuAction?.(action);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setMenuOpen?.(false);
    }
  });
}

bindOverflowMenu();
