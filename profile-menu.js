'use strict';

const api = window.electronAPI;

function bindProfileMenu() {
  const menu = document.getElementById('agent-profile-menu');
  if (!menu) {
    return;
  }

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-action]');
    if (!item) {
      return;
    }
    const action = item.dataset.action;
    api?.setProfileOpen?.(false);
    if (action === 'settings') {
      api?.toolsAction?.('settings');
      return;
    }
    if (action === 'exit') {
      api?.menuAction?.('exit');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setProfileOpen?.(false);
    }
  });
}

bindProfileMenu();
