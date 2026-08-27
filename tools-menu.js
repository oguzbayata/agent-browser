'use strict';

const api = window.electronAPI;

function bindToolsMenu() {
  const menu = document.getElementById('agent-tools-menu');
  if (!menu) {
    return;
  }

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-tools]');
    if (!item) {
      return;
    }
    api?.toolsAction?.(item.dataset.tools);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setToolsOpen?.(false);
    }
  });
}

bindToolsMenu();
