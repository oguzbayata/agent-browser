'use strict';

document.getElementById('btn-useful-links')?.addEventListener('click', () => {
  window.electronAPI?.openUsefulLinks?.();
});
