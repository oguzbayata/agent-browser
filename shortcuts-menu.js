'use strict';

const api = window.electronAPI;

function bindShortcutsMenu() {
  const menu = document.getElementById('agent-shortcuts-menu');
  if (!menu) {
    return;
  }

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-url], [data-action]');
    if (!item) {
      return;
    }
    if (item.dataset.action === 'new-tab') {
      api?.createTab?.();
    } else if (item.dataset.url) {
      api?.navigate?.(item.dataset.url);
    }
    api?.setShortcutsOpen?.(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setShortcutsOpen?.(false);
    }
  });
}

bindShortcutsMenu();
