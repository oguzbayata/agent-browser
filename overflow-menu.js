'use strict';

const api = window.electronAPI;

function applyOverflowSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return;
  }
  const hunter = document.getElementById('toggle-mediaHunter');
  if (hunter && typeof settings.mediaHunter === 'boolean') {
    hunter.checked = settings.mediaHunter;
  }
}

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

  menu.addEventListener('change', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.setting) {
      return;
    }
    api?.setSetting?.(field.dataset.setting, field.checked)?.then((result) => {
      if (result?.settings) {
        applyOverflowSettings(result.settings);
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setMenuOpen?.(false);
    }
  });

  api?.onSettings?.((settings) => {
    applyOverflowSettings(settings);
  });
  api?.getSettings?.()?.then((result) => {
    if (result?.ok && result.settings) {
      applyOverflowSettings(result.settings);
    }
  });
}

bindOverflowMenu();
